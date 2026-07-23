import { useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, Heart, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function NpsMasaje() {
  const { token = "" } = useParams<{ token: string }>();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const survey = trpc.masajes.public.getNpsSurvey.useQuery(
    { token },
    { retry: false, enabled: Boolean(token) },
  );
  const submit = trpc.masajes.public.submitNps.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const firstName = survey.data?.clientName?.trim().split(/\s+/)[0] || "";
  const answered = submitted || survey.data?.alreadyResponded;

  return (
    <main className="min-h-screen bg-[#f6f3ed] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-7 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-[#536481]">Cancagua Spa</p>
          <h1 className="mt-3 text-3xl font-serif text-[#283246] sm:text-4xl">Tu experiencia nos importa</h1>
        </div>

        <Card className="border-[#ded8cd] bg-white shadow-sm">
          <CardContent className="p-6 sm:p-10">
            {survey.isLoading ? (
              <div className="flex min-h-56 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-[#536481]" />
              </div>
            ) : survey.error ? (
              <div className="py-12 text-center">
                <p className="font-medium text-[#283246]">No pudimos abrir esta encuesta.</p>
                <p className="mt-2 text-sm text-muted-foreground">{survey.error.message}</p>
              </div>
            ) : answered ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
                <h2 className="mt-5 text-2xl font-semibold text-[#283246]">¡Muchas gracias!</h2>
                <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                  Tu respuesta quedó registrada y nos ayudará a seguir mejorando la experiencia Cancagua.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <Heart className="mx-auto h-8 w-8 text-[#536481]" />
                  <h2 className="mt-4 text-xl font-semibold text-[#283246]">
                    {firstName ? `${firstName}, ¿` : "¿"}qué tan probable es que nos recomiendes?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {survey.data?.serviceName} · Escoge una nota del 0 al 10
                  </p>
                </div>

                <div className="mt-7 grid grid-cols-6 gap-2 sm:grid-cols-11">
                  {Array.from({ length: 11 }, (_, value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScore(value)}
                      className={`aspect-square rounded-lg border text-sm font-semibold transition ${
                        score === value
                          ? "border-[#536481] bg-[#536481] text-white"
                          : "border-[#d8d3ca] bg-white text-[#283246] hover:border-[#536481] hover:bg-[#f4f6f9]"
                      }`}
                      aria-pressed={score === value}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>Nada probable</span>
                  <span>Muy probable</span>
                </div>

                {score !== null && (
                  <div className="mt-7">
                    <label htmlFor="nps-comment" className="text-sm font-medium text-[#283246]">
                      ¿Quieres contarnos algo más? <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <Textarea
                      id="nps-comment"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      maxLength={1500}
                      rows={4}
                      className="mt-2"
                      placeholder="Cuéntanos qué te gustó o qué podríamos mejorar..."
                    />
                    <Button
                      className="mt-5 w-full bg-[#536481] text-white hover:bg-[#43516a]"
                      disabled={submit.isPending}
                      onClick={() => submit.mutate({ token, score, comment: comment.trim() || undefined })}
                    >
                      {submit.isPending ? "Enviando..." : "Enviar respuesta"}
                    </Button>
                    {submit.error && (
                      <p className="mt-3 text-center text-sm text-red-600">{submit.error.message}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
