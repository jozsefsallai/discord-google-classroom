const truncate = (str: string, length: number): string => {
  return str.length > length
    ? `${str.substr(0, length - 3)}...`
    : str;
};

export default truncate;
