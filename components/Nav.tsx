"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";

export function Nav() {
  const { user } = useSession();
  return (
    <nav className="top">
      <Link href="/">sign in</Link>
      <Link href="/feed">feed</Link>
      <Link href="/studio">studio</Link>
      <Link href="/chats">chats</Link>
      <Link href="/debug">debug</Link>
      <span className="who">
        {user ? `#${user.id} ${user.email} · ${user.role}` : "signed out"}
      </span>
    </nav>
  );
}
