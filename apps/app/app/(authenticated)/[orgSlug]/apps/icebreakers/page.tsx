import { Header } from "../../../components/header";
import { IcebreakersApp } from "./icebreakers-app";

export default function IcebreakersPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Icebreakers" pages={["Apps"]} />
      <IcebreakersApp />
    </div>
  );
}
