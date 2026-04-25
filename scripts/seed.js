const mongoose = require('mongoose')

const MONGO_URI = 'mongodb://db:27017/spenddata'

const UserSchema = new mongoose.Schema({ name: String, color: String }, { timestamps: true })
const CategorySchema = new mongoose.Schema({ name: String, color: String }, { timestamps: true })
const ExpenseSchema = new mongoose.Schema({
  description: String,
  amount: Number,
  date: Date,
  userId: mongoose.Schema.Types.ObjectId,
  categoryId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true })

const User = mongoose.model('User', UserSchema)
const Category = mongoose.model('Category', CategorySchema)
const Expense = mongoose.model('Expense', ExpenseSchema)

async function connect(retries = 12, delay = 2500) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGO_URI)
      return
    } catch {
      if (i === retries - 1) throw new Error('MongoDB did not become ready in time')
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

async function seed() {
  await connect()

  await User.deleteMany({})
  await Category.deleteMany({})
  await Expense.deleteMany({})

  const users = await User.insertMany([
    { name: 'Gerard',  color: '#00ff94' },
    { name: 'Sarah',   color: '#82aaff' },
    { name: 'Marc',    color: '#f78c6c' },
    { name: 'Cristina',color: '#c792ea' },
    { name: 'Laura',   color: '#ffcb6b' },
    { name: 'Alex',    color: '#89ddff' },
  ])

  const categories = await Category.insertMany([
    { name: 'Food',              color: '#00ff94' },
    { name: 'Office',            color: '#82aaff' },
    { name: 'Travel',            color: '#f78c6c' },
    { name: 'Software',          color: '#c792ea' },
    { name: 'Events',            color: '#ffcb6b' },
    { name: 'Legal',             color: '#ff5370' },
    { name: 'Hardware',          color: '#89ddff' },
    { name: 'Marketing',         color: '#ff9cac' },
    { name: 'Office Appliances', color: '#b2ccd6' },
  ])

  const u = Object.fromEntries(users.map(u => [u.name, u._id]))
  const c = Object.fromEntries(categories.map(c => [c.name, c._id]))

  await Expense.insertMany([
    { description: 'Team lunch',          amount: 45.5,   date: new Date('2026-01-05'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Office supplies',     amount: 120,    date: new Date('2026-01-08'), userId: u['Sarah'],    categoryId: c['Office'] },
    { description: 'Client dinner',       amount: 230.75, date: new Date('2026-01-12'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Flight to Madrid',    amount: 380,    date: new Date('2026-01-15'), userId: u['Marc'],     categoryId: c['Travel'] },
    { description: 'Hotel Barcelona',     amount: 210,    date: new Date('2026-01-18'), userId: u['Sarah'],    categoryId: c['Travel'] },
    { description: 'Software license',    amount: 99,     date: new Date('2026-01-20'), userId: u['Marc'],     categoryId: c['Software'] },
    { description: 'Team coffee',         amount: 18.5,   date: new Date('2026-01-22'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Printer paper',       amount: 35,     date: new Date('2026-01-25'), userId: u['Sarah'],    categoryId: c['Office'] },
    { description: 'Flight to Barcelona', amount: 128,    date: new Date('2026-01-29'), userId: u['Cristina'], categoryId: c['Travel'] },
    { description: 'Conference ticket',   amount: 450,    date: new Date('2026-02-01'), userId: u['Marc'],     categoryId: c['Events'] },
    { description: 'Catering',            amount: 180,    date: new Date('2026-02-07'), userId: u['Sarah'],    categoryId: c['Food'] },
    { description: 'AWS invoice',         amount: 320,    date: new Date('2026-02-10'), userId: u['Marc'],     categoryId: c['Software'] },
    { description: 'Flight to Paris',     amount: 290,    date: new Date('2026-02-12'), userId: u['Gerard'],   categoryId: c['Travel'] },
    { description: 'Team offsite',        amount: 950,    date: new Date('2026-02-14'), userId: u['Gerard'],   categoryId: c['Events'] },
    { description: 'Keyboard',            amount: 75,     date: new Date('2026-02-18'), userId: u['Sarah'],    categoryId: c['Office'] },
    { description: 'Team lunch',          amount: 45.5,   date: new Date('2026-03-01'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Q1 Team offsite',     amount: 950,    date: new Date('2026-03-01'), userId: u['Laura'],    categoryId: c['Events'] },
    { description: 'Office supplies',     amount: 120,    date: new Date('2026-03-02'), userId: u['Sarah'],    categoryId: c['Office'] },
    { description: 'AWS infrastructure',  amount: 320,    date: new Date('2026-03-03'), userId: u['Marc'],     categoryId: c['Software'] },
    { description: 'Client dinner',       amount: 230.75, date: new Date('2026-03-05'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Legal consulting',    amount: 780,    date: new Date('2026-03-05'), userId: u['Sarah'],    categoryId: c['Legal'] },
    { description: 'Sales conference',    amount: 450,    date: new Date('2026-03-07'), userId: u['Gerard'],   categoryId: c['Events'] },
    { description: 'Flight to Madrid',    amount: 380,    date: new Date('2026-03-08'), userId: u['Marc'],     categoryId: c['Travel'] },
    { description: 'Hotel Barcelona',     amount: 210,    date: new Date('2026-03-10'), userId: u['Sarah'],    categoryId: c['Travel'] },
    { description: 'Company retreat',     amount: 1200,   date: new Date('2026-03-10'), userId: u['Laura'],    categoryId: c['Events'] },
    { description: 'Software license',    amount: 99,     date: new Date('2026-03-12'), userId: u['Marc'],     categoryId: c['Software'] },
    { description: 'New laptops',         amount: 2400,   date: new Date('2026-03-12'), userId: u['Marc'],     categoryId: c['Hardware'] },
    { description: 'Team coffee',         amount: 18.5,   date: new Date('2026-03-14'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Marketing campaign',  amount: 890,    date: new Date('2026-03-14'), userId: u['Sarah'],    categoryId: c['Marketing'] },
    { description: 'Printer paper',       amount: 35,     date: new Date('2026-03-15'), userId: u['Sarah'],    categoryId: c['Office'] },
    { description: 'Client entertainment',amount: 340,    date: new Date('2026-03-16'), userId: u['Gerard'],   categoryId: c['Food'] },
    { description: 'Office renovation',   amount: 1500,   date: new Date('2026-03-18'), userId: u['Laura'],    categoryId: c['Office'] },
    { description: 'Cloud services',      amount: 275,    date: new Date('2026-03-20'), userId: u['Marc'],     categoryId: c['Software'] },
    { description: 'Pens',                amount: 10,     date: new Date('2026-04-23'), userId: u['Alex'],     categoryId: c['Office Appliances'] },
  ])

  console.log('seed complete')
  await mongoose.disconnect()
}

seed().catch(e => { console.error('seed failed:', e.message); process.exit(1) })
