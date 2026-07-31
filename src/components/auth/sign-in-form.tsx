"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { api } from "@/lib/client-api";
import type { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";

export function SignInForm({ className }: { className?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    // Validate on submit rather than on keystroke — nobody wants to be told
    // their address is invalid while they're still typing the domain.
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address, e.g. you@studio.dev");
      return;
    }

    setPending(true);
    setError(null);

    const result = await api.post<{ user: unknown }>("/api/auth/session", { email: trimmed });

    if (!result.ok) {
      setPending(false);
      setError(messageFor(result.error));
      return;
    }

    router.push("/campaigns");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn("flex flex-col gap-4", className)}>
      <Field
        id="signin-email"
        label="Email"
        helper="Used only to find your saved progress."
        error={error ?? undefined}
        state={error ? "invalid" : "idle"}
        required
      >
        <TextInput
          id="signin-email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@studio.dev"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          state={error ? "invalid" : "idle"}
          disabled={pending}
          aria-describedby={error ? "signin-email-error" : "signin-email-helper"}
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Enter the forge
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </form>
  );
}

function messageFor(error: ApiError): string {
  return error.fields?.email ?? error.message;
}
