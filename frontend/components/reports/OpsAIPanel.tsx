'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { reportingApi } from '@/lib/api/reporting';
import { workordersApi } from '@/lib/api/workorders';
import { getUserFacingError } from '@/lib/api/errors';
import { useToast } from '@/lib/hooks/useToast';

type OpsAIPanelProps = {
  startDate: string;
  endDate: string;
  exceptionList?: Array<{ type: string; reference: string; message: string; status?: string }>;
  traceQuery?: { work_order_id?: number; part_id?: number } | null;
};

export function OpsDailyBriefing({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { toast } = useToast();
  const [briefing, setBriefing] = useState('');
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => reportingApi.generateDailyBriefing({ start_date: startDate, end_date: endDate }),
    onSuccess: (data) => setBriefing(data.briefing || ''),
    onError: (err) => toast({ title: 'Briefing failed', description: getUserFacingError(err), variant: 'destructive' }),
  });

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Daily Briefing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate briefing
        </Button>
        {briefing && (
          <>
            <Textarea readOnly value={briefing} className="min-h-[140px] text-sm" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(briefing);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Copy
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function OpsExceptionTriage({
  exceptionList,
}: {
  exceptionList: Array<{ type: string; reference: string; message: string; status?: string }>;
}) {
  const { toast } = useToast();
  const [triage, setTriage] = useState<Array<{
    reference: string;
    priority_rank: number;
    suggested_owner: string;
    suggested_action: string;
    draft_sms: string;
  }>>([]);

  const mutation = useMutation({
    mutationFn: () => reportingApi.triageExceptions(),
    onSuccess: (data) => setTriage(data.triage || []),
    onError: (err) => toast({ title: 'Triage failed', description: getUserFacingError(err), variant: 'destructive' }),
  });

  if (!exceptionList.length) return null;

  return (
    <div className="mb-4 space-y-3">
      <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
        AI Triage exceptions
      </Button>
      {triage.length > 0 && (
        <div className="space-y-2">
          {[...triage].sort((a, b) => a.priority_rank - b.priority_rank).map((item, i) => (
            <Alert key={i}>
              <AlertDescription className="text-sm space-y-1">
                <p className="font-medium">#{item.priority_rank} — {item.reference}</p>
                <p><span className="text-muted-foreground">Owner:</span> {item.suggested_owner}</p>
                <p><span className="text-muted-foreground">Action:</span> {item.suggested_action}</p>
                {item.draft_sms && (
                  <p className="italic border-l-2 pl-2 mt-1">&ldquo;{item.draft_sms}&rdquo;</p>
                )}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}

export function OpsAINarrativeButton({
  label,
  onGenerate,
  resultKey = 'narrative',
}: {
  label: string;
  onGenerate: () => Promise<Record<string, string | number | undefined>>;
  resultKey?: string;
}) {
  const { toast } = useToast();
  const [text, setText] = useState('');

  const mutation = useMutation({
    mutationFn: onGenerate,
    onSuccess: (data) => setText(String(data[resultKey] ?? data.analysis ?? '')),
    onError: (err) => toast({ title: 'AI analysis failed', description: getUserFacingError(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-3 mb-4">
      <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
        {label}
      </Button>
      {text && <p className="text-sm text-muted-foreground whitespace-pre-wrap border rounded-md p-3 bg-muted/30">{text}</p>}
    </div>
  );
}

export function OpsTraceabilityQA({
  traceQuery,
}: {
  traceQuery: { work_order_id?: number; part_id?: number } | null;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportingApi.traceabilityQA({
        question,
        work_order_id: traceQuery?.work_order_id,
        part_id: traceQuery?.part_id,
      }),
    onSuccess: (data) => setAnswer(data.answer || ''),
    onError: (err) => toast({ title: 'Q&A failed', description: getUserFacingError(err), variant: 'destructive' }),
  });

  if (!traceQuery) return null;

  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <p className="text-sm font-medium flex items-center gap-2">
        <Sparkles className="h-4 w-4" /> Ask about this trace chain
      </p>
      <Textarea
        placeholder="e.g. Where did this part come from?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="min-h-[60px]"
      />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={!question.trim() || mutation.isPending}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Ask AI
      </Button>
      {answer && <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">{answer}</p>}
    </div>
  );
}

export function OpsWorkflowBottleneck() {
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState('');

  const mutation = useMutation({
    mutationFn: () => workordersApi.getWorkflowAiAnalysis(),
    onSuccess: (data) => setAnalysis(data.analysis || ''),
    onError: (err) => toast({ title: 'Bottleneck analysis failed', description: getUserFacingError(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-3 mb-4">
      <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
        AI workflow bottleneck analysis
      </Button>
      {analysis && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap border rounded-md p-3 bg-muted/30">{analysis}</p>
      )}
    </div>
  );
}
