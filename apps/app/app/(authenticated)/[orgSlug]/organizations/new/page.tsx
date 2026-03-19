import { redirect } from "next/navigation";

// The "Create Organization" action is handled via the dialog on the organizations list page.
const NewOrgPage = async ({ params }: { params: Promise<{ orgSlug: string }> }) => {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/organizations`);
};

export default NewOrgPage;
