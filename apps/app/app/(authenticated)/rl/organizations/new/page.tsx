import { redirect } from "next/navigation";

// The "Create Organization" action is handled via the dialog on the organizations list page.
const NewOrgPage = () => {
  redirect("/rl/organizations");
};

export default NewOrgPage;
