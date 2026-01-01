import { Wrench } from "lucide-react";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-1.5 rounded-lg">
                            <Wrench className="h-5 w-5 text-white" />
                        </div>
                        <div className="font-bold text-lg text-gray-900">Smart Repairs</div>
                    </div>
                    <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                        Customer Portal
                    </div>
                </div>
            </header>
            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
            <footer className="bg-white border-t border-gray-200 mt-auto">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-400">
                    &copy; {new Date().getFullYear()} Smart Vehicle Repairs. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
