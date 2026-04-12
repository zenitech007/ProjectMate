
import React from 'react';
import { Wand2, Loader2, ChevronRight, GripVertical } from 'lucide-react';
import { ProjectOutline } from '../../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TOCProps {
  outline: ProjectOutline[];
  activeChapter: string;
  onSelect: (title: string) => void;
  onGenerateSection: (sectionTitle: string) => void;
  onReorderOutline: (newOutline: ProjectOutline[]) => void;
  generatingSection: string | null;
}

interface SortableSectionProps {
  section: string;
  chapterTitle: string;
  activeChapter: string;
  generatingSection: string | null;
  onSelect: (title: string) => void;
  onGenerateSection: (sectionTitle: string) => void;
}

const SortableSection: React.FC<SortableSectionProps> = ({
  section,
  chapterTitle,
  activeChapter,
  generatingSection,
  onSelect,
  onGenerateSection,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `${chapterTitle}-${section}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col group/item relative bg-white"
    >
      <div className="toc-row text-[10px] text-slate-400 font-semibold items-center">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-slate-200 hover:text-slate-400">
          <GripVertical className="h-3 w-3" />
        </div>
        <button
          onClick={() => onSelect(chapterTitle)}
          className="truncate max-w-35 hover:text-slate-700 transition-colors text-left"
        >
          {section}
        </button>
        <span className="toc-leader border-slate-50"></span>

        <div className="flex items-center ml-2">
          {generatingSection === section ? (
            <div className="bg-green-50 text-green-700 p-1.5 rounded-lg">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerateSection(section);
              }}
              className="p-1.5 text-slate-200 hover:text-green-600 hover:bg-green-50 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all transform hover:scale-110 active:scale-95"
              title={`Draft ${section}`}
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const TableOfContents: React.FC<TOCProps> = ({
  outline,
  activeChapter,
  onSelect,
  onGenerateSection,
  onReorderOutline,
  generatingSection
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (chapterIdx: number, event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const chapterTitle = outline[chapterIdx].title;
      const oldIndex = outline[chapterIdx].sections.indexOf((active.id as string).replace(`${chapterTitle}-`, ''));
      const newIndex = outline[chapterIdx].sections.indexOf((over.id as string).replace(`${chapterTitle}-`, ''));

      const newSections = arrayMove(outline[chapterIdx].sections, oldIndex, newIndex);
      const newOutline = [...outline];
      newOutline[chapterIdx] = {
        ...newOutline[chapterIdx],
        sections: newSections,
      };

      onReorderOutline(newOutline);
    }
  };

  return (
    <div className="p-6 space-y-10 overflow-y-auto h-full bg-white custom-scrollbar">
      <div>
        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] mb-6 flex items-center">
          <ChevronRight className="h-3 w-3 mr-1" />
          Chapters
        </h3>
        <div className="space-y-8">
          {outline.map((chapter, chapterIdx) => (
            <div key={chapter.title} className="space-y-4">
              <button
                onClick={() => onSelect(chapter.title)}
                className={`w-full text-left group transition-all ${activeChapter === chapter.title ? 'text-green-700 font-extrabold translate-x-1' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <div className="toc-row text-[11px] font-black uppercase tracking-widest">
                  <span className="truncate">{chapter.title}</span>
                  <span className="toc-leader"></span>
                  <span className="tabular-nums opacity-50">{chapterIdx + 1}</span>
                </div>
              </button>

              <div className="pl-2 space-y-3 border-l border-slate-100 ml-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(chapterIdx, event)}
                >
                  <SortableContext
                    items={chapter.sections.map(s => `${chapter.title}-${s}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {chapter.sections.map((section) => (
                      <SortableSection
                        key={section}
                        section={section}
                        chapterTitle={chapter.title}
                        activeChapter={activeChapter}
                        generatingSection={generatingSection}
                        onSelect={onSelect}
                        onGenerateSection={onGenerateSection}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TableOfContents;
