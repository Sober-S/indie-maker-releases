 /**
  * 卖家配置 — 从 Excel 导入 + 手动补充
  */
 const SELLERS = [
   { name: '718制造',    userId: '1213810608' },
   { name: 'Aike的研发笔记', userId: '425383005' },
   { name: '明日香made',  userId: '1841596800' },
   { name: '黑猫MADE',    userId: '1780372466' },
   { name: 'One(Bruce)', userId: '1857927157' },
   { name: 'CVW',        userId: '1801401190' },
   { name: 'CZ出品',      userId: '1703533049' },
   { name: '凯撒Made',    userId: '1673962685' },
   { name: '卡尔出品',     userId: '1759104005' },
   { name: 'Cola出品(新店)', userId: '1785487515' },
   { name: 'Cola出品',    userId: '1820181201' },
   { name: '很酷出品',     userId: '1616859853' },
   { name: 'DB Made',    userId: '1746841069' },
   { name: '百岁山Made',   userId: '1833952829' },
   { name: '小草出品',     userId: '1725149480' },
   { name: 'HFsMade',    userId: '1791683814' },
   { name: 'JUDX',       userId: '1735775997' },
   { name: '珍绮made',    userId: '1830297161' },
   { name: 'Joker世家',   userId: '1858725248' },
   { name: '百万made',    userId: '1868092506' },
   { name: '老炮made',    userId: '1862533901' },
   { name: 'Old Manor',  userId: '1610636997' },
   { name: '海蛎子出品',   userId: '1618427725' },
   { name: '小兰Studio',  userId: '1627919585' },
   { name: '胖虎潮玩',     userId: '1690148013' },
   { name: '大反派(Pone)', userId: '1759462442' },
   { name: 'XxZ official', userId: '1819448614' },
   { name: 'ARC Made',   userId: '1871639661' },
   { name: 'neo studio',  userId: '1681515933' },
   { name: 'MADE BY VICKY', userId: '1736017933' },
 ];
 
 export default SELLERS;
 
 export function findSeller(input) {
   // input can be userId, name, or index
   if (!input || input === 'all') return SELLERS;
   
   // Try userId match
   const byId = SELLERS.filter(s => s.userId === input);
   if (byId.length > 0) return byId;
   
   // Try name fuzzy match
   const lower = input.toLowerCase();
   const byName = SELLERS.filter(s => 
     s.name.toLowerCase().includes(lower) || 
     s.userId.includes(input)
   );
   if (byName.length > 0) return byName;
   
   return [];
 }
