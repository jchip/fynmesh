// Sample e-commerce order data for AG Grid demo

export interface OrderData {
  orderId: string;
  orderDate: string;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  customerName: string;
  customerEmail: string;
  region: string;
  product: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

const statuses: OrderData['status'][] = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East'];
const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys'];

const products: Record<string, string[]> = {
  'Electronics': ['Laptop Pro 15"', 'Wireless Mouse', 'USB-C Hub', 'Bluetooth Speaker', 'Smart Watch', '4K Monitor'],
  'Clothing': ['Cotton T-Shirt', 'Denim Jeans', 'Running Shoes', 'Winter Jacket', 'Wool Sweater', 'Baseball Cap'],
  'Home & Garden': ['LED Desk Lamp', 'Plant Pot Set', 'Tool Kit', 'Garden Hose', 'Coffee Maker', 'Throw Blanket'],
  'Sports': ['Yoga Mat', 'Dumbbells Set', 'Tennis Racket', 'Basketball', 'Hiking Backpack', 'Resistance Bands'],
  'Books': ['JavaScript Guide', 'React Mastery', 'Node.js Patterns', 'TypeScript Deep Dive', 'CSS Secrets', 'Web Performance'],
  'Toys': ['Building Blocks', 'Remote Car', 'Board Game', 'Puzzle Set', 'Action Figure', 'Plush Toy'],
};

const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas',
  'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia', 'Henry', 'Harper', 'Alexander', 'Evelyn', 'Sebastian'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateOrderId(index: number): string {
  return `ORD-${String(index + 1).padStart(5, '0')}`;
}

function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com', 'mail.com'];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomElement(domains)}`;
}

function generateDate(): string {
  const start = new Date(2024, 0, 1);
  const end = new Date(2024, 11, 31);
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

export function generateOrderData(count: number = 500): OrderData[] {
  const orders: OrderData[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = randomElement(firstNames);
    const lastName = randomElement(lastNames);
    const category = randomElement(categories);
    const product = randomElement(products[category]);
    const quantity = randomInt(1, 10);
    const unitPrice = randomInt(10, 500) + 0.99;
    const totalAmount = Math.round(quantity * unitPrice * 100) / 100;

    orders.push({
      orderId: generateOrderId(i),
      orderDate: generateDate(),
      status: randomElement(statuses),
      customerName: `${firstName} ${lastName}`,
      customerEmail: generateEmail(firstName, lastName),
      region: randomElement(regions),
      product,
      category,
      quantity,
      unitPrice,
      totalAmount,
    });
  }

  // Sort by date descending
  orders.sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return orders;
}

// Pre-generated data for consistency
export const orderData = generateOrderData(500);
