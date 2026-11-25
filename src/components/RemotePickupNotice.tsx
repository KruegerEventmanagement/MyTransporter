import { remotePickupAddress, remotePickupNotice } from "@/lib/key-handover";

/** Rote Warnung, wenn das Fahrzeug nicht in Leonberg abgeholt wird. */
export function RemotePickupNotice({ plate, className = "" }: { plate: string | null | undefined; className?: string }) {
  const address = remotePickupAddress(plate);
  if (!address) return null;
  return (
    <div role="alert" className={`rounded-xl border-2 border-destructive bg-destructive/10 p-3 text-sm font-semibold text-destructive ${className}`}>
      {remotePickupNotice(address)}
    </div>
  );
}
