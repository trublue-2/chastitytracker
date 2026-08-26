import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import OrgasmusForm from "../../OrgasmusForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { effectiveOrgasmusArten, resolveOrgasmusOptions } from "@/lib/reasonsService";

export default async function NewOrgasmusPage() {
  const session = await auth();
  const tz = session!.user.timezone ?? APP_TZ;
  const tf = await getTranslations("orgasmForm");
  const user = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { orgasmusArtenConfig: true } });
  const artOptions = resolveOrgasmusOptions(effectiveOrgasmusArten(user?.orgasmusArtenConfig), tf);
  return (
    <EntryActionFormShell {...actionSign("ORGASMUS")} title={tf("title")}>
      <OrgasmusForm artOptions={artOptions} tz={tz} nowDefault={nowDatetimeLocal(tz)} />
    </EntryActionFormShell>
  );
}
