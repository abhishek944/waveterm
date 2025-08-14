import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copybutton";

interface MarkdownProps {
    text: string;
    className?: string;
    onClickExecute?: (cmd: string) => void;
}

const CodeBlock: React.FC<{ children: React.ReactNode; onClickExecute?: (cmd: string) => void }> = ({
    children,
    onClickExecute,
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

    return (
        <pre className="codeblock relative group bg-[var(--background-light)] border border-[var(--background-light)] text-[var(--text-normal)] p-3 my-1 rounded-md overflow-x-auto">
            {children}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton
                    className="p-1 h-auto"
                    onClick={() => navigator.clipboard.writeText(getTextContent(children).replace(/\n$/, ""))}
                    title="Copy"
                />
                {onClickExecute && (
                    <button onClick={handleExecute} className="p-1 h-auto hover:bg-accent rounded-md ml-2">
                        <i className="fa-regular fa-square-terminal"></i>
                    </button>
                )}
            </div>
        </pre>
    );
};

const Markdown: React.FC<MarkdownProps> = ({ text, className, onClickExecute }) => {
    const markdownComponents = {
        p: (props: any) => <p {...props} className="my-1 break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }} />,
        a: (props: any) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" />,
        h1: (props: any) => <h1 {...props} className="text-2xl font-bold my-4" />,
        h2: (props: any) => <h2 {...props} className="text-xl font-bold my-3" />,
        h3: (props: any) => <h3 {...props} className="text-lg font-bold my-1" />,
        h4: (props: any) => <h4 {...props} className="text-base font-bold my-1" />,
        h5: (props: any) => <h5 {...props} className="text-sm font-bold" />,
        h6: (props: any) => <h6 {...props} className="text-xs font-bold" />,
        ul: (props: any) => <ul {...props} className="list-disc list-inside my-1" />,
        ol: (props: any) => <ol {...props} className="list-decimal list-inside my-1" />,
        li: (props: any) => <li {...props} className="my-1" />,
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