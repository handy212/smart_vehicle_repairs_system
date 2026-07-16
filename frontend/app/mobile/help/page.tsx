"use client";

import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getGuideById } from "@/lib/help";
import type { HelpBlock } from "@/lib/help/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";

function renderBlock(block: HelpBlock, index: number) {
  switch (block.type) {
    case "paragraph":
    case "note":
      return (
        <p key={index} className="text-sm text-muted-foreground whitespace-pre-wrap">
          {block.text}
        </p>
      );
    case "steps":
    case "checklist":
    case "tips":
    case "mistakes":
      return (
        <ul key={index} className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>{item.replace(/\*\*/g, "")}</li>
          ))}
        </ul>
      );
    case "troubleshooting":
      return (
        <div key={index} className="space-y-2 text-sm">
          {block.items.map((item, i) => (
            <div key={i} className="rounded border border-border p-2">
              <p className="font-medium text-foreground">{item.problem}</p>
              <p className="text-muted-foreground mt-1">{item.solution}</p>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default function MobileHelpPage() {
  const router = useRouter();
  const guides = [
    getGuideById("mobile-technician"),
    getGuideById("technician"),
  ].filter(Boolean);

  return (
    <MobilePageShell
      title="Help"
      backHref="/mobile/more"
      backLabel="More"
      className="space-y-4"
    >
      {guides.map((guide) =>
        guide ? (
          <Card key={guide.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{guide.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{guide.description}</p>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {guide.topics.map((topic, idx) => (
                  <AccordionItem key={idx} value={`${guide.id}-${idx}`}>
                    <AccordionTrigger className="text-sm text-left">
                      {topic.title}
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-3">
                      {topic.summary && (
                        <p className="text-sm text-muted-foreground">{topic.summary}</p>
                      )}
                      {topic.blocks.map((block, bi) => renderBlock(block, bi))}
                      {topic.actionLink && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => router.push(topic.actionLink!)}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {topic.actionLabel || "Open"}
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ) : null
      )}
    </MobilePageShell>
  );
}
