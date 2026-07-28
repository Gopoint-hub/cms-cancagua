import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CalendarPlus, Image, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RegularClassesHeader, todayString } from "./shared";

const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const emptyClass = {
  name: "", shortDescription: "", description: "", imageUrl: "", location: "", capacity: "", active: true,
};

export default function RegularClassesClasses() {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyClass);
  const [scheduleClass, setScheduleClass] = useState<any | null>(null);
  const [schedule, setSchedule] = useState({
    teacherId: "", dayOfWeek: "1", startTime: "08:30", endTime: "09:30", validFrom: todayString(),
  });
  const classes = trpc.regularClasses.classes.list.useQuery();
  const teachers = trpc.regularClasses.teachers.list.useQuery();
  const uploadImage = trpc.masajes.tecnicas.uploadImage.useMutation({
    onError: (error) => toast.error(error.message),
  });
  const save = trpc.regularClasses.classes.save.useMutation({
    onSuccess: () => {
      toast.success("Clase guardada");
      setEditing(null);
      setForm(emptyClass);
      utils.regularClasses.classes.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const addSchedule = trpc.regularClasses.classes.addSchedule.useMutation({
    onSuccess: () => {
      toast.success("Horario agregado");
      setScheduleClass(null);
      utils.regularClasses.classes.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const removeSchedule = trpc.regularClasses.classes.removeSchedule.useMutation({
    onSuccess: () => {
      toast.success("Horario desactivado");
      utils.regularClasses.classes.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const openEdit = (item?: any) => {
    setEditing(item ?? {});
    setForm(item ? {
      name: item.name,
      shortDescription: item.shortDescription ?? "",
      description: item.description ?? "",
      imageUrl: item.imageUrl ?? "",
      location: item.location ?? "",
      capacity: item.capacity ? String(item.capacity) : "",
      active: Boolean(item.active),
    } : emptyClass);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader
          title="Clases y horarios"
          description="Contenido que luego podrá publicarse en cancagua.cl/clases."
          actions={<Button onClick={() => openEdit()}><Plus className="mr-2 h-4 w-4" /> Nueva clase</Button>}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {classes.data?.map((item) => (
            <Card key={item.id} className={!item.active ? "opacity-60" : ""}>
              {item.imageUrl && <img src={item.imageUrl} alt="" className="h-44 w-full rounded-t-xl object-cover" />}
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{item.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{item.shortDescription || "Sin descripción breve"}</p>
                  </div>
                  <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Activa" : "Inactiva"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {item.schedules.map((slot) => (
                    <div key={slot.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <strong>{days[slot.dayOfWeek]}</strong> · {slot.startTime}–{slot.endTime}
                        <p className="text-xs text-muted-foreground">{slot.teacherName}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeSchedule.mutate({ id: slot.id })}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                  {item.schedules.length === 0 && <p className="text-sm text-muted-foreground">Sin horarios vigentes.</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(item)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setScheduleClass(item)}>
                    <CalendarPlus className="mr-2 h-4 w-4" /> Horario
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar clase" : "Nueva clase"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Descripción breve</Label><Input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} /></div>
            <div className="space-y-2"><Label>Descripción completa</Label><Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Image className="h-4 w-4" /> Fotografía</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadImage.isPending}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const imageData = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(file);
                  });
                  const result = await uploadImage.mutateAsync({ imageData, mimeType: file.type });
                  setForm((current) => ({ ...current, imageUrl: result.url }));
                  toast.success("Fotografía cargada");
                }}
              />
              <Label className="text-xs text-muted-foreground">O pega una URL</Label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
              {form.imageUrl && <img src={form.imageUrl} alt="" className="h-36 w-full rounded-lg object-cover" />}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Ubicación</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="space-y-2"><Label>Capacidad informativa</Label><Input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate({
              id: editing?.id,
              name: form.name,
              shortDescription: form.shortDescription || undefined,
              description: form.description || undefined,
              imageUrl: form.imageUrl || undefined,
              location: form.location || undefined,
              capacity: form.capacity ? Number(form.capacity) : undefined,
              active: form.active,
            })}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(scheduleClass)} onOpenChange={(open) => !open && setScheduleClass(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar horario · {scheduleClass?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Profesor</Label>
              <Select value={schedule.teacherId} onValueChange={(teacherId) => setSchedule({ ...schedule, teacherId })}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>{teachers.data?.filter((teacher) => teacher.active).map((teacher) => (
                  <SelectItem key={teacher.id} value={String(teacher.id)}>{teacher.name}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Día</Label>
              <Select value={schedule.dayOfWeek} onValueChange={(dayOfWeek) => setSchedule({ ...schedule, dayOfWeek })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{days.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Inicio</Label><Input type="time" value={schedule.startTime} onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })} /></div>
              <div className="space-y-2"><Label>Término</Label><Input type="time" value={schedule.endTime} onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Vigente desde</Label><Input type="date" value={schedule.validFrom} onChange={(e) => setSchedule({ ...schedule, validFrom: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleClass(null)}>Cancelar</Button>
            <Button disabled={!schedule.teacherId || addSchedule.isPending} onClick={() => addSchedule.mutate({
              disciplineId: scheduleClass.id,
              teacherId: Number(schedule.teacherId),
              dayOfWeek: Number(schedule.dayOfWeek),
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              validFrom: schedule.validFrom,
            })}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
