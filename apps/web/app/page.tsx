"use client"

import styles from './page.module.css'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function Home() {
  const {data: session} = useSession();

  const Dashboard = session ? <Link href="/dashboard"> Dashboard </Link>: ""

  return (
    <>
    <div>
        {Dashboard}
    </div>
    </>

  )
}
