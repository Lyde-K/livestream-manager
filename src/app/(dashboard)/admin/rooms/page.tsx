"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, DoorOpen } from "lucide-react";

interface Room { id: string; name: string; notes: string | null; isActive: boolean; }

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/rooms");
    setRooms(await res.json());
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setName(""); setNotes(""); setOpen(true); }
  function openEdit(r: Room) { setEditing(r); setName(r.name); setNotes(r.notes || ""); setOpen(true); }

  async function save() {
    setLoading(true);
    const url = editing ? `/api/rooms/${editing.id}` : "/api/rooms";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, notes }) });
    setLoading(false);
    setOpen(false);
    load();
  }

  async function toggleActive(room: Room) {
    await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...room, isActive: !room.isActive }),
    });
    load();
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Rooms</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage your {rooms.filter(r => r.isActive).length} active studio rooms
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> Add Room</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {rooms.length === 0 && (
          <div className="col-span-full section-card empty-state">
            <DoorOpen size={28} className="mx-auto mb-2 opacity-30" />
            No rooms yet.
          </div>
        )}
        {rooms.map((room) => (
          <div
            key={room.id}
            className="section-card p-4 flex flex-col gap-2 transition-opacity"
            style={{ opacity: room.isActive ? 1 : 0.5 }}
          >
            <div className="flex items-start justify-between">
              <div
                className="p-2 rounded-lg"
                style={{ background: "var(--accent-light)" }}
              >
                <DoorOpen size={18} style={{ color: "var(--accent)" }} />
              </div>
              <Badge variant={room.isActive ? "success" : "secondary"}>
                {room.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{room.name}</div>
              {room.notes && (
                <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{room.notes}</div>
              )}
            </div>
            <div
              className="flex gap-1.5 mt-auto pt-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => openEdit(room)}>
                <Pencil size={12} /> Edit
              </Button>
              <Button size="sm" variant={room.isActive ? "secondary" : "outline"} className="flex-1 text-xs" onClick={() => toggleActive(room)}>
                {room.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Room" : "Add Room"} size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Room Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 1" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Multi-brand room" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={loading}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
