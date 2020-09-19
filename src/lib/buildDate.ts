export interface BuildDateOpts {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  hours?: number | null;
  minutes?: number | null;
}

const pad = (n?: number | null): string => typeof n === 'number' ? (n < 10 ? `0${n}` : `${n}`) : '00';

const buildDate = ({ year, month, day, hours, minutes }: BuildDateOpts): Date => {
  return new Date(`${year}-${month}-${day}T${pad(hours)}:${pad(minutes)}:00.000Z`);
};

export default buildDate;
