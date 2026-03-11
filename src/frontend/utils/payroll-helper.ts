export const getMondaysCount = (dateString: string): number => {
    const date = new Date(dateString + "T00:00:00");
    const month = date.getMonth();
    const year = date.getFullYear();
    let count = 0;
    const d = new Date(year, month, 1);
    
    while (d.getMonth() === month) {
        if (d.getDay() === 1) count++; 
        d.setDate(d.getDate() + 1);
    }
    return count;
};

export const calculateWeeklyFactor = (monthlySalary: number): number => {
    return (monthlySalary * 12) / 52;
};