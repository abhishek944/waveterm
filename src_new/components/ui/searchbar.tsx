import * as React from "react";
import { GlobalModel } from "@/models";

interface SearchBarProps {
    className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ className }) => {
    // Legacy inline search component disabled.
    // Use global Cmd+F modal or per-line LineSearchBar.
    return null;
};
