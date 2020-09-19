import { format, utcToZonedTime } from 'date-fns-tz';
import config from '../config';

const formatDate = (dateObject: Date): string => {
  const timeZone = config.bot.timezone || 'UTC';
  return format(utcToZonedTime(dateObject, timeZone), 'MMMM dd, yyyy h:mm a');
};

export default formatDate;
