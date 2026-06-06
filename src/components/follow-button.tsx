"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";

export function FollowButton({
  caseId,
  initialFollowing,
  variant = "pill"
}: {
  caseId: string;
  initialFollowing: boolean;
  variant?: "pill" | "card";
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [isPending, startTransition] = useTransition();

  function toggleFollow() {
    const nextFollowing = !following;
    setFollowing(nextFollowing);

    startTransition(async () => {
      const response = await fetch(`/api/cases/${caseId}/follow`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ following: nextFollowing })
      });

      if (!response.ok) {
        setFollowing(!nextFollowing);
        return;
      }

      router.refresh();
    });
  }

  return (
    <button
      className={`${variant === "card" ? "follow-button follow-button--card" : "email-action-pill follow-button"} ${
        following ? "is-following" : ""
      }`}
      type="button"
      onClick={toggleFollow}
      disabled={isPending}
      aria-pressed={following}
    >
      <Bookmark size={variant === "card" ? 14 : 15} aria-hidden="true" />
      <span>{following ? "已关注" : "关注"}</span>
    </button>
  );
}
