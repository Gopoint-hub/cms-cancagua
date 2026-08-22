export const SKEDU_PROGRAM_PARTY_SIZES = [1, 2, 3, 4] as const;
export type SkeduProgramPartySize = (typeof SKEDU_PROGRAM_PARTY_SIZES)[number];
export type SkeduProgramScheduleMode = "simultaneous" | "two_by_two";

export function getSkeduProgramSecondStartTime(
  startTime: string,
  duration: number,
  preparationMinutes = 10
): string {
  const [hour, minute] = startTime.split(":").map(Number);
  const total = hour * 60 + minute + duration + preparationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Identified = { id: number };
type ProgramRoom = Identified & { type?: string };

export type SkeduProgramAvailabilitySnapshot<
  Therapist extends Identified,
  Room extends ProgramRoom,
> = {
  availableTherapists: Therapist[];
  availableRooms: Room[];
  endTime: string;
};

export type SkeduProgramResourceSegment<
  Therapist extends Identified,
  Room extends ProgramRoom,
> = {
  partySize: 1 | 2;
  modality: "simple" | "double";
  startTime: string;
  endTime: string;
  therapists: Therapist[];
  room: Room;
};

export type SkeduProgramResourcePlan<
  Therapist extends Identified,
  Room extends ProgramRoom,
> = {
  available: boolean;
  requiredTherapists: number;
  requiredRooms: number;
  therapists: Therapist[];
  rooms: Room[];
  endTime: string;
  segments: SkeduProgramResourceSegment<Therapist, Room>[];
};

const commonById = <Item extends Identified>(left: Item[], right: Item[]) => {
  const rightIds = new Set(right.map(item => item.id));
  return left.filter(item => rightIds.has(item.id));
};

/**
 * Convierte las disponibilidades ya filtradas por agenda en un plan atómico
 * para la reserva grupal. La primera disponibilidad siempre corresponde a la
 * primera tanda; la segunda corresponde a la sala simple simultánea (grupo de
 * 3) o a la segunda tanda (2+2).
 */
export function buildSkeduProgramResourcePlan<
  Therapist extends Identified,
  Room extends ProgramRoom,
>(input: {
  partySize: SkeduProgramPartySize;
  scheduleMode: SkeduProgramScheduleMode;
  startTime: string;
  secondStartTime?: string;
  primary: SkeduProgramAvailabilitySnapshot<Therapist, Room>;
  secondary?: SkeduProgramAvailabilitySnapshot<Therapist, Room>;
  preferredRoomId?: number;
}): SkeduProgramResourcePlan<Therapist, Room> {
  const twoByTwo = input.partySize === 4 && input.scheduleMode === "two_by_two";
  const requiredTherapists = twoByTwo ? 2 : input.partySize;
  const requiredRooms = input.partySize <= 2 || twoByTwo ? 1 : 2;
  const secondary = input.secondary;

  const therapistCandidates =
    twoByTwo || input.partySize === 3
      ? secondary
        ? commonById(
            input.primary.availableTherapists,
            secondary.availableTherapists
          )
        : []
      : input.primary.availableTherapists;

  let primaryRoomCandidates = input.primary.availableRooms;
  if (input.partySize === 3) {
    primaryRoomCandidates = secondary
      ? primaryRoomCandidates.filter(primaryRoom =>
          secondary.availableRooms.some(room => room.id !== primaryRoom.id)
        )
      : [];
  } else if (input.partySize === 4 && !twoByTwo) {
    primaryRoomCandidates = primaryRoomCandidates.filter(primaryRoom =>
      input.primary.availableRooms.some(room => room.id !== primaryRoom.id)
    );
  } else if (twoByTwo) {
    primaryRoomCandidates = secondary
      ? commonById(primaryRoomCandidates, secondary.availableRooms)
      : [];
  }

  const primaryRoom =
    input.preferredRoomId == null
      ? primaryRoomCandidates[0]
      : primaryRoomCandidates.find(room => room.id === input.preferredRoomId);
  const selectedTherapists = therapistCandidates.slice(0, requiredTherapists);
  const unavailable =
    !primaryRoom || selectedTherapists.length < requiredTherapists;

  const emptyPlan: SkeduProgramResourcePlan<Therapist, Room> = {
    available: false,
    requiredTherapists,
    requiredRooms,
    therapists: therapistCandidates,
    rooms: primaryRoomCandidates,
    endTime: twoByTwo ? (secondary?.endTime ?? "") : input.primary.endTime,
    segments: [],
  };
  if (unavailable) return emptyPlan;

  if (input.partySize <= 2) {
    return {
      ...emptyPlan,
      available: true,
      segments: [
        {
          partySize: input.partySize === 1 ? 1 : 2,
          modality: input.partySize === 1 ? "simple" : "double",
          startTime: input.startTime,
          endTime: input.primary.endTime,
          therapists: selectedTherapists,
          room: primaryRoom,
        },
      ],
    };
  }

  if (input.partySize === 3) {
    const alternateRooms = secondary!.availableRooms.filter(
      room => room.id !== primaryRoom.id
    );
    const secondRoom =
      alternateRooms.find(room => room.type === "individual") ??
      alternateRooms[0];
    if (!secondRoom) return emptyPlan;
    return {
      ...emptyPlan,
      available: true,
      segments: [
        {
          partySize: 2,
          modality: "double",
          startTime: input.startTime,
          endTime: input.primary.endTime,
          therapists: selectedTherapists.slice(0, 2),
          room: primaryRoom,
        },
        {
          partySize: 1,
          modality: "simple",
          startTime: input.startTime,
          endTime: secondary!.endTime,
          therapists: selectedTherapists.slice(2, 3),
          room: secondRoom,
        },
      ],
    };
  }

  if (twoByTwo) {
    if (!secondary || !input.secondStartTime) return emptyPlan;
    return {
      ...emptyPlan,
      available: true,
      segments: [
        {
          partySize: 2,
          modality: "double",
          startTime: input.startTime,
          endTime: input.primary.endTime,
          therapists: selectedTherapists,
          room: primaryRoom,
        },
        {
          partySize: 2,
          modality: "double",
          startTime: input.secondStartTime,
          endTime: secondary.endTime,
          therapists: selectedTherapists,
          room: primaryRoom,
        },
      ],
    };
  }

  const secondRoom = input.primary.availableRooms.find(
    room => room.id !== primaryRoom.id
  );
  if (!secondRoom) return emptyPlan;
  return {
    ...emptyPlan,
    available: true,
    segments: [
      {
        partySize: 2,
        modality: "double",
        startTime: input.startTime,
        endTime: input.primary.endTime,
        therapists: selectedTherapists.slice(0, 2),
        room: primaryRoom,
      },
      {
        partySize: 2,
        modality: "double",
        startTime: input.startTime,
        endTime: input.primary.endTime,
        therapists: selectedTherapists.slice(2, 4),
        room: secondRoom,
      },
    ],
  };
}
