"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, FileText } from "lucide-react";

export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const router = useRouter();

  const status = (params.get("status") || "success").toLowerCase();
  const invoiceId = params.get("invoice_id");
  const reference = params.get("reference");
  const reason = params.get("reason") || params.get("paystack_status");

  const isSuccess = status === "success";

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSuccess ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600" />
            )}
            {isSuccess ? "Payment Successful" : "Payment Failed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant={isSuccess ? "success" : "danger"}>{status}</Badge>
            {invoiceId && <Badge variant="secondary">Invoice #{invoiceId}</Badge>}
          </div>

          {reference && (
            <div className="text-sm text-muted-foreground">
              Reference: <span className="font-mono">{reference}</span>
            </div>
          )}

          {!isSuccess && reason && (
            <div className="text-sm text-muted-foreground">
              Reason: <span className="font-medium">{reason}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => router.push("/portal/invoices")}
              className="w-full sm:w-auto"
            >
              Close
            </Button>

            {invoiceId && (
              <Button
                onClick={() => router.push(`/portal/invoices/${invoiceId}`)}
                className="w-full sm:w-auto"
              >
                <FileText className="w-4 h-4 mr-2" />
                View Invoice
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


