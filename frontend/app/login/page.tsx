"use client";

import Image from "next/image";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="flex min-w-0 flex-1 items-center justify-center p-8">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-xl border border-navy-800 bg-navy-900 p-8">
        <Image src="/logo.png" alt="Hail Mary" width={40} height={41} priority />
        <div>
          <h1 className="text-xl font-semibold text-navy-100">Admin sign in</h1>
          <p className="mt-1 text-sm text-navy-300">Settings, weights, and scoring rules.</p>
        </div>
        <label className="block text-sm text-navy-200">
          Email
          <input
            name="email"
            type="email"
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-navy-700 bg-navy-950 px-3 py-2 text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
          />
        </label>
        <label className="block text-sm text-navy-200">
          Password
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-md border border-navy-700 bg-navy-950 px-3 py-2 text-navy-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
          />
        </label>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
