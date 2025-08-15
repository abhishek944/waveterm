import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copybutton";

interface MarkdownProps {
    text: string;
    className?: string;
    onClickExecute?: (cmd: string) => void;
    showCopyButton?: boolean;
    showExecuteButton?: boolean;
    uiTheme?: 'default' | 'aichat' | 'terminal';
}

const CodeBlock: React.FC<{ 
    children: React.ReactNode; 
    onClickExecute?: (cmd: string) => void;
    showCopyButton?: boolean;
    showExecuteButton?: boolean;
    uiTheme?: string;
}> = ({
    children,
    onClickExecute,
    showCopyButton = true,
    showExecuteButton = true,
    uiTheme = 'default',
}) => {
    const getTextContent = (children: any): string => {
        if (typeof children === "string") {
            return children;
        } else if (Array.isArray(children)) {
            return children.map(getTextContent).join("");
        } else if (children.props && children.props.children) {
            return getTextContent(children.props.children);
        }
        return "";
    };

    const handleExecute = (e: React.MouseEvent) => {
        let textToCopy = getTextContent(children);
        textToCopy = textToCopy.replace(/\n$/, ""); // remove trailing newline
        onClickExecute?.(textToCopy);
    };

    // Different styles based on UI theme
    const codeBlockStyles = {
        default: "bg-[var(--background-light)] border border-[var(--background-light)] text-[var(--text-normal)]",
        aichat: "text-gray-100",
        terminal: "bg-black text-green-400 border border-green-400/20"
    };

    return (
        <pre className={cn(
            "codeblock relative group p-3 my-1 rounded-md overflow-x-auto max-w-full",
            codeBlockStyles[uiTheme] || codeBlockStyles.default
        )}>
            {children}
            {(showCopyButton || showExecuteButton) && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {showCopyButton && (
                        <CopyButton
                            className="p-1 h-auto"
                            onClick={() => navigator.clipboard.writeText(getTextContent(children).replace(/\n$/, ""))}
                            title="Copy"
                        />
                    )}
                    {showExecuteButton && onClickExecute && (
                        <button onClick={handleExecute} className="p-1 h-auto hover:bg-accent rounded-md ml-2">
                            <i className="fa-regular fa-square-terminal"></i>
                        </button>
                    )}
                </div>
            )}
        </pre>
    );
};

const Markdown: React.FC<MarkdownProps> = ({ 
    text, 
    className, 
    onClickExecute,
    showCopyButton = true,
    showExecuteButton = true,
    uiTheme = 'default' 
}) => {
    // Theme-specific styles
    const linkStyles = {
        default: "text-blue-500 hover:underline",
        aichat: "text-blue-300 hover:underline",
        terminal: "text-green-400 hover:underline"
    };

    // Theme-specific text colors for better visibility
    const textColorClass = uiTheme === 'aichat' ? 'text-gray-100' : '';
    const mutedTextColorClass = uiTheme === 'aichat' ? 'text-gray-300' : '';

    const markdownComponents = {
        p: (props: any) => <p {...props} className={cn("my-1 break-words", mutedTextColorClass)} style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }} />,
        a: (props: any) => <a {...props} target="_blank" rel="noopener noreferrer" className={linkStyles[uiTheme] || linkStyles.default} />,
        strong: (props: any) => <strong {...props} className={cn("font-bold", textColorClass)} />,
        em: (props: any) => <em {...props} className={cn("italic", mutedTextColorClass)} />,
        h1: (props: any) => <h1 {...props} className={cn("text-2xl font-bold my-4", textColorClass)} />,
        h2: (props: any) => <h2 {...props} className={cn("text-xl font-bold my-3", textColorClass)} />,
        h3: (props: any) => <h3 {...props} className={cn("text-lg font-bold my-1", textColorClass)} />,
        h4: (props: any) => <h4 {...props} className={cn("text-base font-bold my-1", textColorClass)} />,
        h5: (props: any) => <h5 {...props} className={cn("text-sm font-bold", textColorClass)} />,
        h6: (props: any) => <h6 {...props} className={cn("text-xs font-bold", textColorClass)} />,
        ul: (props: any) => <ul {...props} className={cn("list-disc list-inside my-1", mutedTextColorClass)} />,
        ol: (props: any) => <ol {...props} className={cn("list-decimal list-inside my-1", mutedTextColorClass)} />,
        li: (props: any) => <li {...props} className={cn("my-1", mutedTextColorClass)} />,
        code: (props: any) => <code {...props} className="bg-[var(--background-light)] text-[var(--text-normal)] rounded-sm px-1 text-sm" />,
        pre: (props: any) => <CodeBlock {...props} onClickExecute={onClickExecute} />,
    };

    return (
        <div 
            className={cn("markdown-view", className)}
            style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {text}
            </ReactMarkdown>
        </div>
    );
};

export { Markdown };