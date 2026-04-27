import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Phone, Mail, MapPin, ShieldCheck } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";

export const Route = createFileRoute("/p_/perfil")({
  head: () => ({ meta: [{ title: "Mi perfil · Mi portal" }] }),
  component: PortalProfile,
});

function PortalProfile() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ["portal-me"], queryFn: () => api.portalMe() });

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [pronouns, setPronouns] = useState("");

  useEffect(() => {
    if (me?.patient) {
      setPhone(me.patient.phone ?? "");
      setEmail(me.patient.email ?? "");
      setAddress((me.patient as any).address ?? "");
      setPreferredName(me.patient.preferredName ?? "");
      setPronouns(me.patient.pronouns ?? "");
    }
  }, [me?.patient?.id]);

  const saveMu = useMutation({
    mutationFn: () => api.portalUpdateMe({ phone, email, address, preferred_name: preferredName, pronouns }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-me"] });
      toast.success("Perfil actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !me) {
    return <PortalShell><Loader2 className="h-6 w-6 mx-auto animate-spin text-ink-400" /></PortalShell>;
  }

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Tus datos</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Mi perfil</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Mantén tus datos de contacto al día para que tu psicóloga pueda comunicarse contigo.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); saveMu.mutate(); }}
        className="rounded-2xl border border-line-200 bg-surface p-6 space-y-5"
      >
        <div className="flex items-center gap-4 pb-4 border-b border-line-100">
          <div className="h-16 w-16 rounded-full bg-brand-50 text-brand-700 text-xl font-serif flex items-center justify-center border-2 border-brand-100">
            {me.patient.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-xl text-ink-900 leading-tight">{me.patient.name}</h2>
            <p className="text-xs text-ink-500 mt-0.5">{me.patient.doc} · {me.patient.age} años</p>
          </div>
        </div>

        <Field label="Cómo te gusta que te llamen">
          <input
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="Ej: Cami, Andrés, etc."
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <Field label="Pronombres">
          <select
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          >
            <option value="">— No especificar —</option>
            <option value="ella">ella</option>
            <option value="él">él</option>
            <option value="elle">elle</option>
          </select>
        </Field>

        <Field label="Teléfono" icon={<Phone className="h-3.5 w-3.5" />}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+57 300 000 0000"
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <Field label="Correo electrónico" icon={<Mail className="h-3.5 w-3.5" />}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <Field label="Dirección" icon={<MapPin className="h-3.5 w-3.5" />}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ciudad, barrio, calle"
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <button
          type="submit"
          disabled={saveMu.isPending}
          className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saveMu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </button>
      </form>

      {me.professional && (
        <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-medium">Tu psicóloga</p>
          <h3 className="font-serif text-lg text-ink-900 mt-1">{me.professional.name}</h3>
          {me.professional.title && <p className="text-sm text-ink-500">{me.professional.title}</p>}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-sage-500 shrink-0 mt-0.5" />
        <p className="text-xs text-ink-500 leading-relaxed">
          Tu información está protegida según la Ley 1581/2012 de Habeas Data.
          Solo tú y tu psicóloga pueden ver estos datos. Puedes pedir su eliminación
          o portabilidad en cualquier momento contactando a la clínica.
        </p>
      </div>
    </PortalShell>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5 inline-flex items-center gap-1.5">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
