import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

// POST /api/visit — increment visitCount and update lastVisitAt for the current user
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId  = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      visitCount:  { increment: 1 },
      lastVisitAt: new Date(),
    },
    select: { visitCount: true, lastVisitAt: true },
  });

  return NextResponse.json(user);
}
