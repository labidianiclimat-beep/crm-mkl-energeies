"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationBell({ onOpenAgenda, onOpenRequest }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  async function load() {
    try {
      const response = await authFetch("/api/notifications");
      const data = await response.json().catch(() => ({}));
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const unread = items.filter(item => !item.read_at).length;

  async function markRead(item) {
    if (item?.id) {
      await authFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => null);
      setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }
    setOpen(false);
    if (item?.request_id && onOpenRequest) onOpenRequest(item.request_id);
    else if (item?.appointment_id && onOpenAgenda) onOpenAgenda(item.appointment_id);
  }

  async function markAll() {
    await authFetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => null);
    setItems(current => current.map(row => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
  }

  return <div className="notification-bell">
    <button className="icon-btn" type="button" aria-label="Notifications" onClick={() => setOpen(current => !current)}>
      <Bell size={19}/>
      {unread > 0 && <i/>}
    </button>
    {open && <div className="notification-panel">
      <div className="notification-panel-head">
        <b>Notifications</b>
        {unread > 0 && <button type="button" onClick={markAll}>Tout lu</button>}
      </div>
      {!items.length && <p className="notification-empty">Aucune notification</p>}
      <ul>
        {items.map(item => (
          <li key={item.id}>
            <button type="button" className={item.read_at ? "" : "unread"} onClick={() => markRead(item)}>
              <strong>{item.title}</strong>
              {item.body && <span>{item.body}</span>}
              <small>{formatWhen(item.created_at)}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>}
  </div>;
}
