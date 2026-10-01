"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/components/store";
import { ProfileView } from "@/components/profile";
import { Loading } from "@/components/ui";

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  if (!store.ready) return <Loading />;
  const person = store.person(id);
  if (!person)
    return (
      <div className="py-24 text-center">
        <p className="text-muted">No agent with that id.</p>
        <Link href="/people" className="mt-3 inline-block text-rose underline">
          See all agents
        </Link>
      </div>
    );
  return <ProfileView person={person} />;
}
