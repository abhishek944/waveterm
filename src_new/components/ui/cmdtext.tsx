import * as React from "react";

const CmdText: React.FC<{ text: string }> = ({ text }) => {
    return <span className="font-mono text-lg">&#x2318;{text}</span>;
};

export { CmdText };