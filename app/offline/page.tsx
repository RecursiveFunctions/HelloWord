import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata = { title: "Offline · HelloWord" };

/** The service worker's navigation fallback. Must not depend on the network. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WifiOff />
          </EmptyMedia>
          <EmptyTitle>You are offline</EmptyTitle>
          <EmptyDescription>
            Review is server-authoritative, so grading a card needs a
            connection. Anything you already opened is still in the cache.
          </EmptyDescription>
        </EmptyHeader>
        <Button render={<Link href="/notebooks" />}>Try again</Button>
      </Empty>
    </div>
  );
}
