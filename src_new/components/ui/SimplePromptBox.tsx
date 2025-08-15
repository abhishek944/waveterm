import * as React from "react";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as PopoverPrimitive from "@radix-ui/react-popover";

type ClassValue = string | number | boolean | null | undefined;
function cn(...inputs: ClassValue[]): string {
    return inputs.filter(Boolean).join(" ");
}

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { showArrow?: boolean }
>(({ className, sideOffset = 4, showArrow = false, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "relative z-50 max-w-[280px] rounded-md bg-popover text-popover-foreground px-1.5 py-1 text-xs animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                className
            )}
            {...props}
        >
            {props.children}
            {showArrow && <TooltipPrimitive.Arrow className="-my-px fill-popover" />}
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
    <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            className={cn(
                "z-50 w-64 rounded-xl bg-popover dark:bg-[#303030] p-2 text-popover-foreground dark:text-white shadow-md outline-none animate-in data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                className
            )}
            {...props}
        />
    </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const SendIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path
            d="M12 5.25L12 18.75"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M18.75 12L12 5.25L5.25 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);


const aiProviders = [
    { id: "openai", name: "OpenAI", icon: "🤖" },
    { id: "azure", name: "Azure OpenAI", icon: "☁️" },
    { id: "gemini", name: "Gemini", icon: "✨" },
];

export const SimplePromptBox = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
    const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [value, setValue] = React.useState("");
    const [selectedProvider, setSelectedProvider] = React.useState(() => {
        // Try to get the default provider from client data
        const clientData = GlobalModel.clientData.get();
        return clientData?.aiopts?.default || "openai";
    });
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);

    React.useImperativeHandle(ref, () => internalTextareaRef.current!, []);

    React.useLayoutEffect(() => {
        const textarea = internalTextareaRef.current;
        if (textarea && value) {
            textarea.style.height = "auto";
            const newHeight = Math.min(textarea.scrollHeight, 200);
            textarea.style.height = `${newHeight}px`;
        }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
        if (props.onChange) props.onChange(e);
    };

    const handleSubmit = async () => {
        if (!value.trim() || isLoading) return;
        
        setIsLoading(true);
        try {
            const chatId = GlobalModel.sidebarchatModel.getCurrentChatId();
            console.log("Current chat ID:", chatId);
            console.log("Chat history:", GlobalModel.sidebarchatModel.getChatHistory());
            
            if (!chatId) {
                console.error("No active chat - attempting to create one");
                // Try to create a new chat
                const result = await GlobalCommandRunner.aiChatNew();
                if (!result.success) {
                    console.error("Failed to create new chat");
                    return;
                }
                // Wait a bit for the update to be processed
                await new Promise(resolve => setTimeout(resolve, 100));
                const newChatId = GlobalModel.sidebarchatModel.getCurrentChatId();
                if (!newChatId) {
                    console.error("Still no chat ID after creating new chat");
                    return;
                }
            }
            
            // Get the final chat ID (either existing or newly created)
            const finalChatId = GlobalModel.sidebarchatModel.getCurrentChatId();
            if (!finalChatId) {
                console.error("Unable to get chat ID");
                return;
            }
            
            // Add the user message to the chat immediately
            const userMessage: AIMessageType = {
                messageid: `temp-${Date.now()}`,
                chatid: finalChatId,
                role: "user",
                content: value.trim(),
                createdts: Date.now()
            };
            console.log("Adding user message to history:", userMessage);
            console.log("Current history before add:", GlobalModel.sidebarchatModel.getChatHistory());
            GlobalModel.sidebarchatModel.addMessageToHistory(userMessage);
            console.log("Current history after add:", GlobalModel.sidebarchatModel.getChatHistory());
            
            // Clear the input
            setValue("");
            
            // Set loading state on the model
            GlobalModel.sidebarchatModel.setIsLoading(true);
            
            // Send the message
            await GlobalCommandRunner.aiChatSend(finalChatId, userMessage.content, selectedProvider);
            
            // Clear loading state (will also be cleared when response arrives)
            GlobalModel.sidebarchatModel.setIsLoading(false);
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const hasValue = value.trim().length > 0;
    const activeProvider = aiProviders.find((p) => p.id === selectedProvider);

    return (
        <div
            className={cn(
                "flex flex-col rounded-[28px] p-2 shadow-sm transition-colors bg-black/50 border border-white/10 cursor-text",
                className
            )}
        >
            <textarea
                ref={internalTextareaRef}
                rows={1}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                className="custom-scrollbar w-full resize-none border-0 bg-transparent p-3 text-white placeholder:text-gray-400 focus:ring-0 focus-visible:outline-none"
                disabled={isLoading}
                {...props}
            />

            <div className="mt-0.5 p-1 pt-0">
                <TooltipProvider delayDuration={100}>
                    <div className="flex items-center gap-2">
                        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="flex h-8 items-center gap-1 rounded-full p-2 text-sm text-white bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-ring"
                                >
                                    <span>{activeProvider ? activeProvider.name : "Select Provider"}</span>
                                    <ChevronDownIcon className="h-4 w-4" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="bg-black/80 border-white/10 text-white">
                                <div className="flex flex-col gap-1">
                                    {aiProviders.map((provider) => (
                                        <button
                                            key={provider.id}
                                            onClick={() => {
                                                setSelectedProvider(provider.id);
                                                setIsPopoverOpen(false);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-white/20"
                                        >
                                            <span>{provider.icon}</span>
                                            <span>{provider.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <div className="ml-auto flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={!hasValue || isLoading}
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none bg-white/20 text-white hover:bg-white/30 disabled:bg-white/10"
                                    >
                                        <SendIcon className="h-6 w-6 text-bold" />
                                        <span className="sr-only">Send message</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" showArrow={true}>
                                    <p>Send</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </TooltipProvider>
            </div>
        </div>
    );
});
SimplePromptBox.displayName = "SimplePromptBox";