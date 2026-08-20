"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";

export function Nav() {
  const { user } = useSession();
  return (
    <nav className="top">
      <Link href="/">вход</Link>
      <Link href="/feed">лента</Link>
      <Link href="/studio">студия</Link>
      <Link href="/chats">чаты</Link>
      <Link href="/debug">debug</Link>
      <span className="who">
        {user ? `#${user.id} ${user.email} · ${user.role}` : "не в системе"}
      </span>
    </nav>
  );
}
