"use client";

import React from "react";
import { X } from "lucide-react";
import { TopicWeight } from "@/types/quizGeneration";

interface TopicSliderProps {
    topic: TopicWeight;
    onChange: (weight: number) => void;
    onDelete: () => void;
}

export default function TopicSlider({ topic, onChange, onDelete }: TopicSliderProps) {
    return (
        <div className="group flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-zinc-300 truncate">{topic.keyword}</span>
                    <span className="text-xs font-mono text-zinc-400 ml-2 shrink-0 w-10 text-right">
                        {topic.weight}%
                    </span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={topic.weight}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-purple-500"
                />
            </div>
            <button
                onClick={onDelete}
                className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove topic"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
