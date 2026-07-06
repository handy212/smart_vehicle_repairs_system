import { useState } from "react";
import { Copy, Plus, QrCode, Shield, Check, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { authApi } from "@/lib/api/auth";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuthStore } from "@/store/authStore";
import { getUserFacingError } from "@/lib/api/errors";

export function TwoFactorSettings() {
    const { user, setUser } = useAuthStore();
    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const [setupData, setSetupData] = useState<{ secret: string; qr_code: string } | null>(null);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // If we don't know the exact property, we assume it's in permissions or extra data
    // Since we don't have it on the frontend User model yet, we'll cast it to any here to check
    const is2FAEnabled = (user as any)?.two_factor_enabled || false;

    const handleStartSetup = async () => {
        try {
            setIsLoading(true);
            const data = await authApi.setup2FA();
            setSetupData(data);
            setIsSetupOpen(true);
        } catch (error) {
            console.error(error);
            toast.error("Failed to initialize 2FA setup");
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifySetup = async () => {
        if (code.length < 6) {
            toast.error("Please enter a valid 6-digit code");
            return;
        }

        try {
            setIsLoading(true);
            const response = await authApi.verify2FASetup(code);
            toast.success("Two-factor authentication enabled successfully");
            setIsSetupOpen(false);
            setSetupData(null);
            setCode("");

            // Update local user state if possible
            if (response.user) {
                setUser(response.user);
            } else if (user) {
                setUser({ ...user, two_factor_enabled: true } as any);
            }
        } catch (error: any) {
            console.error(error);
            toast.error(getUserFacingError(error, "Invalid verification code"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisable2FA = async () => {
        if (!password) {
            toast.error("Please enter your password to disable 2FA");
            return;
        }

        try {
            setIsLoading(true);
            const response = await authApi.disable2FA(password);
            toast.success("Two-factor authentication disabled");
            setPassword("");

            if (response.user) {
                setUser(response.user);
            } else if (user) {
                setUser({ ...user, two_factor_enabled: false } as any);
            }
        } catch (error: any) {
            console.error(error);
            toast.error(getUserFacingError(error, "Failed to disable 2FA"));
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (setupData?.secret) {
            navigator.clipboard.writeText(setupData.secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("Secret key copied to clipboard");
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5" />
                    2FA Authentication
                </CardTitle>
            </CardHeader>
            <CardContent>
                {is2FAEnabled ? (
                    <div className="flex flex-col space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-success/10 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800">
                            <Shield className="h-4 w-4" />
                            <div>
                                <p className="font-semibold">Two-factor authentication is enabled</p>
                            </div>
                        </div>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-fit">
                                    Disable 2FA
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        <br /><br />
                                        Please enter your password to confirm:
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="py-2">
                                    <Input
                                        type="password"
                                        placeholder="Your current password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setPassword("")}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDisable2FA} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isLoading || !password}>
                                        {isLoading ? "Disabling..." : "Disable 2FA"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                ) : (
                    <div className="flex flex-col space-y-4">
                        {!isSetupOpen ? (
                            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                                <Button onClick={handleStartSetup} disabled={isLoading}>
                                    <Plus className="h-4 w-4" />
                                    Enable 2FA
                                </Button>
                            </div>
                        ) : setupData ? (
                            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 p-4 border rounded-xl">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        <QrCode className="h-5 w-5" />
                                        Setup Authenticator App
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        1. Install an authenticator app like Google Authenticator or Authy on your phone.<br />
                                        2. Scan the QR code below.
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row gap-6 items-start">
                                    <div className="p-4 bg-white rounded-xl shadow-sm border">
                                        <img src={setupData.qr_code} alt="2FA QR Code" className="w-48 h-48 object-contain" />
                                    </div>

                                    <div className="space-y-4 flex-1 w-full">
                                        <div>
                                            <p className="text-sm font-medium mb-1">Or enter this key manually:</p>
                                            <div className="flex gap-2">
                                                <Input value={setupData.secret} readOnly className="font-mono text-xs bg-muted" />
                                                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                                                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            <p className="text-sm font-medium mb-1">3. Enter the 6-digit code from the app:</p>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="000000"
                                                    value={code}
                                                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                                    className="font-mono text-center tracking-widest text-lg"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <Button onClick={handleVerifySetup} className="flex-1" disabled={code.length !== 6 || isLoading}>
                                                {isLoading ? "Verifying..." : "Verify & Enable"}
                                            </Button>
                                            <Button variant="outline" onClick={() => { setIsSetupOpen(false); setSetupData(null); }} disabled={isLoading}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
