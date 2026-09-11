"use client";

import { useState, useTransition } from "react";
import { triggerRecompute } from "./actions";

export default function RecomputeButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await triggerRecompute();
            setMessage(result.message);
          })
        }
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {pending ? "Triggering…" : "Recompute now"}
      </button>
      {message && <p className="mt-2 text-sm text-navy-300">{message}</p>}
    </div>
  );
}
