import { requireUser } from "@/lib/auth";
import AccountForm from "../../_ui/account-form";
import PageHeader from "../../_ui/page-header";
import { Card, Mono } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Your account"
        lede="Who you are, and where your agent reaches you when it needs a decision."
      />

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card title="Details">
          <AccountForm displayName={user.display_name} phone={user.phone} />
        </Card>

        <Card title="Under the hood">
          <dl className="flex flex-col divide-y divide-neutral-900">
            <Row term="Sign-in email" value={user.email} />
            <Row term="Account" value={user.id} />
            <Row term="Your Prava customer" value={user.prava_customer_id} />
          </dl>
          <p className="mt-4 border-t border-neutral-900 pt-3 font-sans text-[12px] leading-relaxed text-neutral-600">
            Envelopes you approve belong to that Prava customer, which is
            yours alone. No other account here can draw on them, and neither
            can we without a charge your policy allowed.
          </p>
        </Card>
      </div>
    </>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="font-sans text-[13px] text-neutral-400">{term}</dt>
      <dd className="min-w-0">
        <Mono className="block truncate text-[12px] text-neutral-200">
          {value}
        </Mono>
      </dd>
    </div>
  );
}
