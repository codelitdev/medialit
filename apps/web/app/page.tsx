import Image from 'next/image'
import styles from './page.module.css'
import Link from 'next/link'

export default function Home() {
  return (
    <div>
        <Link href="/dashboard">Dashboard</Link>
        Hello
    </div>
  )
}
