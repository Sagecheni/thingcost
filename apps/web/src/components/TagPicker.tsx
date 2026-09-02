import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from './ui/button.js';
import { FormError } from './ui/form.js';

interface TagPickerProps {
  selected: string[];
  onChange: (tagIds: string[]) => void;
}

/* 标签是贴在档案上的小签条：选中就盖上墨，未选中只有描边。
 * 用真实 checkbox 承载状态，键盘和读屏都能用；视觉靠 has-checked 驱动，
 * 不靠 JS 拼 class。 */
const tagChip = cn(
  'inline-flex cursor-pointer items-center gap-1.5 border border-border',
  'px-2.5 py-1 text-xs text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
  'has-[:checked]:border-primary has-[:checked]:bg-primary',
  'has-[:checked]:text-primary-foreground',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
  'has-[:focus-visible]:outline-offset-2',
);

export function TagPicker({ selected, onChange }: TagPickerProps) {
  const queryClient = useQueryClient();
  const tagsQuery = useQuery({ queryKey: queryKeys.tags, queryFn: api.tags });
  const [newTagName, setNewTagName] = useState('');
  const createTag = useMutation({
    mutationFn: api.createTag,
    onSuccess: async (tag) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      onChange([...selected, tag.id]);
      setNewTagName('');
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(tagsQuery.data ?? []).map((tag) => {
          const checked = selected.includes(tag.id);
          return (
            <label className={tagChip} key={tag.id}>
              <input
                className="sr-only"
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((tagId) => tagId !== tag.id)
                      : [...selected, tag.id],
                  )
                }
              />
              #{tag.name}
            </label>
          );
        })}
        {tagsQuery.data?.length === 0 ? (
          <span className="text-xs text-muted-foreground">还没有标签</span>
        ) : null}
      </div>

      <div className="flex gap-2">
        <input
          data-slot="field"
          className="h-9 min-w-0 flex-1 px-2.5 text-sm text-foreground focus-visible:outline-none"
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          placeholder="新标签名称"
          maxLength={80}
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-9 shrink-0"
          type="button"
          disabled={!newTagName.trim() || createTag.isPending}
          onClick={() => createTag.mutate({ name: newTagName.trim() })}
        >
          <Plus aria-hidden="true" /> 新建
        </Button>
      </div>

      <FormError>{createTag.error?.message}</FormError>
    </div>
  );
}
