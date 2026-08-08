import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

interface TagPickerProps {
  selected: string[];
  onChange: (tagIds: string[]) => void;
}

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
    <div className="tag-picker">
      <div className="tag-options">
        {(tagsQuery.data ?? []).map((tag) => {
          const checked = selected.includes(tag.id);
          return (
            <label className={checked ? 'selected' : ''} key={tag.id}>
              <input
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
        {tagsQuery.data?.length === 0 && <span className="muted-copy">还没有标签</span>}
      </div>
      <div className="tag-create-row">
        <input
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          placeholder="新标签名称"
          maxLength={80}
        />
        <button
          className="secondary-action"
          type="button"
          disabled={!newTagName.trim() || createTag.isPending}
          onClick={() => createTag.mutate({ name: newTagName.trim() })}
        >
          <Plus size={15} /> 新建
        </button>
      </div>
      {createTag.error && <p className="form-error">{createTag.error.message}</p>}
    </div>
  );
}
