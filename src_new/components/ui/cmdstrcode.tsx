import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

interface CmdStrCodeProps {
    cmdstr: string;
    onUse: () => void;
    onCopy: () => void;
    isCopied: boolean;
    fontSize?: "normal" | "large";
    limitHeight?: boolean;
}

const CmdStrCode: React.FC<CmdStrCodeProps> = ({
    cmdstr,
    onUse,
    onCopy,
    isCopied,
    fontSize = "normal",
    limitHeight = false,
}) => {
    const handleUse = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUse?.();
    };

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        onCopy?.();
    };

    return (
        <div
            className={cn(
                "flex flex-row items-start relative p-0",
                fontSize === "large" ? "text-lg" : "text-base",
                limitHeight && "max-h-[58px]",
                limitHeight && fontSize === "large" && "max-h-[68px]"
            )}
        >
            {isCopied && (
                <div className="absolute top-0 left-0 bg-green-500 text-white text-xs rounded-sm px-2 py-1">
                    Copied
                </div>
            )}
            <button
                className="flex-grow-0 p-1 rounded-l-sm h-full w-auto flex items-center justify-center cursor-pointer hover:bg-gray-200"
                title="Use Command"
                onClick={handleUse}
            >
                <Check className="h-4 w-4" />
            </button>
            <div className="flex flex-row min-w-[100px] overflow-auto border-l border-gray-400">
                <code className="flex-shrink-0 min-w-[100px] text-gray-800 whitespace-pre p-1 font-mono">
                    {cmdstr}
                </code>
            </div>
            <div className="relative w-0 block invisible group-hover:visible">
                <button
                    className="absolute bottom-[-1px] right-[-20px] p-1 cursor-pointer w-5 hover:text-gray-800"
                    onClick={handleCopy}
                    title="Copy"
                >
                    <Copy className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

export { CmdStrCode };