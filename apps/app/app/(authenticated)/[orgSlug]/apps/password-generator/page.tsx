import { Header } from "../../../components/header";
import { PasswordGeneratorApp } from "./password-generator-app";

export default function PasswordGeneratorPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Password Generator" pages={["Apps"]} />
      <PasswordGeneratorApp />
    </div>
  );
}
