import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { reviewTaskProof } from "@/lib/taskProofService";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/**
 * Die Keyholderin sichtet einen eingereichten Nachweis — annehmen oder ablehnen.
 *
 * Der Besitzer der Aufgabe steht nicht im Body, sondern wird aus dem Nachweis GELESEN. Ihn den
 * Aufrufer mitschicken zu lassen (wie bei den anderen Admin-Routen) wäre hier eine offene Flanke:
 * er könnte eine fremde Nachweis-id mit der userId eines Subs kombinieren, für den er Keyholder ist,
 * und so über eine Aufgabe urteilen, die ihn nichts angeht.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (typeof body.accepted !== "boolean") return errorResponse(400, "TASK_PROOF_INVALID");

    const proof = await prisma.taskProof.findUnique({
      where: { id },
      select: { task: { select: { userId: true } } },
    });
    if (!proof) return errorResponse(404, "TASK_PROOF_NOT_FOUND");

    const actor = await requireKeyholderOrAdminActor(proof.task.userId);
    if (actor instanceof NextResponse) return actor;

    const result = await reviewTaskProof(id, proof.task.userId, { accepted: body.accepted, note: body.note }, sessionActor(actor));
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/admin/tasks/proofs/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
