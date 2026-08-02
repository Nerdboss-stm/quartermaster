import ListingForm from "../../../_ui/listing-form";
import PageHeader from "../../../_ui/page-header";

export const dynamic = "force-dynamic";

export default function NewListingPage() {
  return (
    <>
      <PageHeader
        title="Sell your spare compute"
        lede="List what you have. Buying agents discover it through the same registry that every other supplier here publishes to, and negotiate with it the same way."
      />
      <div className="p-6">
        <ListingForm />
      </div>
    </>
  );
}
