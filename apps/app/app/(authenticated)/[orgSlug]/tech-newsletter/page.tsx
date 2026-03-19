import { Header } from "../../components/header";
import { TechNewsletterApp } from "./tech-newsletter-app";

export default function TechNewsletterPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Tech Newsletter" pages={["Newsletter Dashboard"]} />
      <TechNewsletterApp />
    </div>
  );
}
