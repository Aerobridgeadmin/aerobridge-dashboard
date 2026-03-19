import { Header } from "../../../components/header";
import { TypingTestApp } from "./typing-test-app";

export default function TypingTestPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Typing Test" pages={["Apps"]} />
      <TypingTestApp />
    </div>
  );
}
