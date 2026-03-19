import { Header } from "../../../components/header";
import { NotepadApp } from "./notepad-app";

export default function NotepadPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Notepad" pages={["Apps"]} />
      <NotepadApp />
    </div>
  );
}
