import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
// import { getSupabase } from "@/lib/supabase";
// import { hashCode } from "@/lib/magic-code-utils";
import connectToDatabase from "@/lib/connect-db";
import VerificationToken from "@/models/verification-token";
import { hashCode } from "@/lib/utils";
import User from "@/models/user";
import Apikey from "@/models/apikey";
import { Constants } from "@medialit/models";
import { getUniqueId } from "@medialit/utils";
import { cookies } from "next/headers";

export const { auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "Email",
            credentials: {},
            async authorize(credentials, req) {
                return { id: 1 };
                // console.log("auth.ts credentials --",credentials)
                //   const parsedCredentials = z
                //     .object({ email: z.string().email(), code: z.string().min(6) })
                //     .safeParse(credentials);
                //   console.log(" auth.ts parsedCredentials --",parsedCredentials)
                //   if (!parsedCredentials.success) {
                //     return null;
                //   }

                //   const { email, code }: any = parsedCredentials.data;
                //   console.log(email, code);
                //   await connectToDatabase();
                //   const verificationToken =
                //       await VerificationToken.findOneAndDelete({
                //           email,
                //           code: hashCode(code),
                //           timestamp: { $gt: Date.now() },
                //       });
                //   if (!verificationToken) {
                //       return null;
                //   }

                //   let user = await User.findOne({
                //       email,
                //   });
                //   if (!user) {
                //       user = await User.create({
                //           email,
                //       });
                //       await Apikey.create({
                //           name: Constants.internalApikeyName,
                //           key: getUniqueId(),
                //           userId: user.id,
                //           internal: true,
                //       });
                //   }
                //   return {
                //       id: user.userId,
                //       email,
                //       name: user.name,
                //   };

                // const supabase = getSupabase(cookies());

                // const { data: verificationToken } = await supabase
                //   .from("verification_tokens")
                //   .select()
                //   .match({ email, code: hashCode(code) })
                //   .gte("timestamp", new Date().toISOString())
                //   .single();

                // if (!verificationToken) {
                //   return null;
                // }

                // const { error } = await supabase
                //   .from("verification_tokens")
                //   .delete()
                //   .eq("id", verificationToken.id);

                // if (error) {
                //   return null;
                // }

                // let { data: userData, error: userError } = await supabase
                //   .from("users")
                //   .select()
                //   .match({ email: verificationToken.email, active: true });

                // if (userError) {
                //   return null;
                // }

                // // console.log(userData)

                // if (userData?.length === 0) {
                //   let { data, error } = await supabase
                //     .from("users")
                //     .insert({ email, accepted_term: true, active: true })
                //     .select();

                //   if (userError) {
                //     return null;
                //   }

                //   //   console.log('userData', data, error);
                //   userData = data;
                // }

                // const user = userData && userData[0];
                // console.log(user);

                // return {
                //   id: user.id,
                //   email: user.email,
                //   name: user.name,
                // };
            },
        }),
    ],
});
