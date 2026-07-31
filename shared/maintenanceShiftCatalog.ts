/**
 * Catálogo de la ficha diaria de mantención.
 *
 * Transcrito del PDF "CHECKLIST DE MANTENCION – CANCAGUA SPA" que entregó la
 * administración, y de los recintos y rangos confirmados por ella. Vive en
 * shared/ porque lo usan la página del CMS y las validaciones del servidor.
 *
 * Dos lecturas ya confirmadas con la administración:
 * - En apertura el original dice "2:50" y "3:00"; como el turno va de 08:00 a
 *   16:00 se leen como 14:50 y 15:00.
 * - El lunes trae una fila de las 21:30 sin tarea escrita: queda como campo
 *   libre para anotar.
 */

export type ShiftName = "apertura" | "cierre";

/** Una tarea puede traer una nota aclaratoria o pedir anotar un dato. */
export type ShiftTaskSpec = {
  text: string;
  note?: string;
  field?: string;
};

export type ShiftTaskBlock = {
  time: string;
  tasks: ShiftTaskSpec[];
};

export type WaterVenue = {
  key: string;
  name: string;
  min: number;
  max: number;
};

/** Las 2 biopiscinas y los 6 hot tubs, con su rango de temperatura. */
export const WATER_VENUES: WaterVenue[] = [
  {
    "key": "biopiscina_1",
    "name": "Biopiscina 1",
    "min": 37,
    "max": 40
  },
  {
    "key": "biopiscina_2",
    "name": "Biopiscina 2",
    "min": 37,
    "max": 40
  },
  {
    "key": "hot_tub_1",
    "name": "Hot Tub 1",
    "min": 38,
    "max": 40
  },
  {
    "key": "hot_tub_2",
    "name": "Hot Tub 2",
    "min": 38,
    "max": 40
  },
  {
    "key": "hot_tub_3",
    "name": "Hot Tub 3",
    "min": 38,
    "max": 40
  },
  {
    "key": "hot_tub_4",
    "name": "Hot Tub 4",
    "min": 38,
    "max": 40
  },
  {
    "key": "hot_tub_5",
    "name": "Hot Tub 5",
    "min": 38,
    "max": 40
  },
  {
    "key": "hot_tub_6",
    "name": "Hot Tub 6",
    "min": 38,
    "max": 40
  }
];

/**
 * Bloques horarios por turno. `lunes` es el día de mantención mayor: ese día
 * solo hay cierre y su lista es propia.
 */
export const SHIFT_CHECKLIST: Record<"lunes" | ShiftName, ShiftTaskBlock[]> = {
  "lunes": [
    {
      "time": "14:00",
      "tasks": [
        {
          "text": "Restablecer equipo de Geotermia (Bio-piscina)"
        },
        {
          "text": "Limpieza de filtros de Bio-Piscina"
        },
        {
          "text": "Verificación de equipo completo de Geotermia"
        },
        {
          "text": "Realizar tareas planificadas"
        },
        {
          "text": "Verificar pasarelas"
        },
        {
          "text": "Verificar equipo de aerotermia"
        },
        {
          "text": "Verificar limpieza de estanques"
        },
        {
          "text": "Estar disponible a tareas",
          "note": "Mario, Lu y Don Pepe"
        },
        {
          "text": "Destapar Bio-piscina",
          "note": "según el horario del día"
        },
        {
          "text": "Llenado y vaciado de hot tub",
          "note": "dejar los cojines en hilera"
        },
        {
          "text": "Rellenado de estanque y pastillas de cloro",
          "note": "5 a 7 min · 1/2 o 1 pastilla"
        }
      ]
    },
    {
      "time": "21:30",
      "tasks": [
        {
          "text": "Tarea de cierre del lunes",
          "note": "el checklist no la especifica — anotar qué se hizo",
          "field": "qué se hizo"
        }
      ]
    }
  ],
  "apertura": [
    {
      "time": "8:00",
      "tasks": [
        {
          "text": "Verificar equipos y estanque de Bio-Piscina"
        },
        {
          "text": "Encender Sauna"
        },
        {
          "text": "Tomar temperatura",
          "note": "activar cascada si está vacía la zona de regeneración"
        }
      ]
    },
    {
      "time": "8:30",
      "tasks": [
        {
          "text": "Verificar nivel de estanques hot tub y hacer retrolavado",
          "note": "30 segundos"
        },
        {
          "text": "Restablecimiento de agua de estanques",
          "note": "5 a 7 minutos"
        },
        {
          "text": "Verificar los equipos"
        }
      ]
    },
    {
      "time": "8:50",
      "tasks": [
        {
          "text": "Llenar hot tubs del horario de la mañana",
          "note": "pasar la red y acomodar los cojines"
        }
      ]
    },
    {
      "time": "9:45",
      "tasks": [
        {
          "text": "Destapar Bio-piscina y tomar temperatura"
        }
      ]
    },
    {
      "time": "10:15–12:00",
      "tasks": [
        {
          "text": "Avanzar con tareas extras"
        }
      ]
    },
    {
      "time": "12:30–14:30",
      "tasks": [
        {
          "text": "Vaciado y llenado de Hot-tubs"
        }
      ]
    },
    {
      "time": "14:50",
      "tasks": [
        {
          "text": "Tomar temperatura biopiscina y verificar equipo de sala de máquinas",
          "note": "el original dice 2:50 · confirmado por Lu"
        }
      ]
    },
    {
      "time": "15:00",
      "tasks": [
        {
          "text": "Colación",
          "note": "el original dice 3:00 · confirmado por Lu"
        }
      ]
    }
  ],
  "cierre": [
    {
      "time": "14:00–15:30",
      "tasks": [
        {
          "text": "Tomar temperaturas biopiscinas"
        },
        {
          "text": "Llenado de hot-tub"
        },
        {
          "text": "Encendido de SAUNA"
        }
      ]
    },
    {
      "time": "15:30",
      "tasks": [
        {
          "text": "Avanzar con tareas extras"
        }
      ]
    },
    {
      "time": "16:30–17:45",
      "tasks": [
        {
          "text": "Vaciado y llenado de Hot-tubs"
        },
        {
          "text": "Bajar bandejas"
        }
      ]
    },
    {
      "time": "17:50",
      "tasks": [
        {
          "text": "Ayuda a recepción"
        }
      ]
    },
    {
      "time": "19:00",
      "tasks": [
        {
          "text": "Colación"
        }
      ]
    },
    {
      "time": "20:00",
      "tasks": [
        {
          "text": "Rellenar libro"
        }
      ]
    },
    {
      "time": "20:30",
      "tasks": [
        {
          "text": "Vaciado de hot-tub"
        }
      ]
    },
    {
      "time": "20:30–21:30",
      "tasks": [
        {
          "text": "Llenado de estanques y cloro"
        }
      ]
    },
    {
      "time": "21:00",
      "tasks": [
        {
          "text": "Tapar Bio-piscinas y tomar temperatura"
        },
        {
          "text": "Limpiar profundamente las paredes de biopiscina"
        },
        {
          "text": "Limpiar fondo y aspirar piscina"
        }
      ]
    }
  ]
};

/**
 * Bolsa de tareas sin horario. No entra al traspaso: si contara como pendiente,
 * arrastraría las mismas 19 tareas todos los días.
 */
export const OTHER_DUTIES: ShiftTaskSpec[] = [
  {
    "text": "Reparación de lo que se haya averiado (bombas)"
  },
  {
    "text": "Hacer carteles"
  },
  {
    "text": "Pintar bodegas y pasarelas"
  },
  {
    "text": "Ayudar al montaje de eventos"
  },
  {
    "text": "Ayudar al traslado de elementos"
  },
  {
    "text": "Mantener el pasto corto"
  },
  {
    "text": "Podar árboles y arbustos"
  },
  {
    "text": "Trasplantar árboles o helechos"
  },
  {
    "text": "Mantener el orden en espacios de trabajo"
  },
  {
    "text": "Ordenar playa, kayaks y ramas",
    "note": "el original dice «kayas»"
  },
  {
    "text": "Hacer astillas y picar leña"
  },
  {
    "text": "Mantener el orden en área de sauna"
  },
  {
    "text": "Mantener stock de cloro y bombas"
  },
  {
    "text": "Avisar de falta de materiales"
  },
  {
    "text": "Compra de materiales cuando sea necesario"
  },
  {
    "text": "Informar en datos técnicos cualquier avería o tarea realizada"
  },
  {
    "text": "Utilizar walkie talkie para coordinación con áreas"
  },
  {
    "text": "Revisar ratoneras y reponer pastillas"
  },
  {
    "text": "Hacer lista de tareas en la pizarra de mantención"
  }
];

/**
 * Llave estable de una tarea. Incluye turno y hora, no solo el texto: "Avanzar
 * con tareas extras" existe en los dos turnos y una llave por texto hacía que
 * marcar una marcara la otra.
 */
export function shiftTaskKey(shift: ShiftName, time: string, text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return `${shift}|${time}|${slug}`;
}

/** Llave de una tarea de la bolsa sin horario. */
export function poolTaskKey(text: string): string {
  return shiftTaskKey("apertura", "pool", text).replace("apertura|pool|", "pool||");
}

/** El lunes solo tiene turno de cierre, con su propia lista. */
export function checklistFor(shift: ShiftName, isMonday: boolean): ShiftTaskBlock[] {
  if (isMonday) return SHIFT_CHECKLIST.lunes;
  return SHIFT_CHECKLIST[shift];
}
