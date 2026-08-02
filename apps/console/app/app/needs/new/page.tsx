import { requireUser } from "@/lib/auth";
import NeedForm from "../../../_ui/need-form";
import PageHeader from "../../../_ui/page-header";

export const dynamic = "force-dynamic";

export default async function NewNeedPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="What do you need?"
        lede="Set the shape of the job and the most you are willing to pay. Then close the laptop — your agent takes it from here."
      />
      <div className="p-6">
        <NeedForm hasPhone={!!user.phone} />
      </div>
    </>
  );
}
