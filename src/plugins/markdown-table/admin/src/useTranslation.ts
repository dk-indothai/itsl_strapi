import { useIntl } from 'react-intl';
export function useTranslation() {
  const { formatMessage } = useIntl();
  return (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: `markdown-table.${id}`, defaultMessage }, values);
}
