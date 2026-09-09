import { forwardRef } from 'react';
import { useField, type InputProps } from '@strapi/strapi/admin';
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

/** The Strapi 5 form owns values, validation, dirty state and document persistence. */
const StrapiInput = forwardRef<MarkdownEditorHandle, InputProps>(function StrapiInput(props, ref) {
  const field = useField<string | null>(props.name);
  return (
    <MarkdownEditor
      ref={ref}
      {...props}
      value={field.value ?? ''}
      error={field.error}
      onChange={(value) => field.onChange(props.name, value)}
    />
  );
});

export default StrapiInput;
